import Input from '@react-input/core/Input';
import SyntheticChangeError from '@react-input/core/SyntheticChangeError';
import createContext from '@react-input/core/createContext';
import definePrototype from '@react-input/core/definePrototype';

import filter from './utils/filter';
import formatToReplacementObject from './utils/formatToReplacementObject';
import resolveDetail from './utils/resolveDetail';
import resolveSelection from './utils/resolveSelection';
import unformat from './utils/unformat';
import validate from './utils/validate';

import type { MaskEventDetail, MaskEventHandler, MaskOptions, Replacement } from './types';
import type { InitFunction, TrackingFunction } from '@react-input/core';

type CachedMaskProps = Required<Omit<MaskOptions, 'track' | 'modify' | 'onMask'>> & {
  replacement: Replacement;
};

interface Cache {
  value: string;
  props: CachedMaskProps;
  fallbackProps: CachedMaskProps;
}

interface ContextValue {
  onmask: MaskEventHandler | null;
}

const context = createContext<Mask, ContextValue>();

function normalizeOptions(options: MaskOptions) {
  return {
    mask: options.mask ?? '',
    replacement:
      typeof options.replacement === 'string'
        ? formatToReplacementObject(options.replacement)
        : options.replacement ?? {},
    showMask: options.showMask ?? false,
    separate: options.separate ?? false,
    track: options.track,
    modify: options.modify,
  };
}

declare class Mask extends Input<MaskEventDetail> {
  constructor(options?: MaskOptions);
  get onmask(): MaskEventHandler | null;
  set onmask(value: MaskEventHandler | null);
}

// TODO: проверить будет ли инициализация пустового объекта предотвращать доступ по ссылке
function Mask(this: Mask, options: MaskOptions = {}) {
  if (!(this instanceof Mask)) {
    // eslint-disable-next-line @stylistic/quotes
    throw new TypeError("Failed to construct 'Mask': Please use the 'new' operator.");
  }

  // TODO: проверить будет ли null кэшировать данные
  let cache: Cache | null = null;

  const eventHandler: MaskEventHandler = (event) => {
    _this.onmask?.(event);
  };

  /**
   * Init
   */
  const init: InitFunction = ({ initialValue, controlled }) => {
    const { mask, replacement, showMask, separate } = normalizeOptions(options);

    if (process.env.NODE_ENV !== 'production') {
      validate({ initialValue, mask, replacement });
    }

    initialValue = controlled || initialValue ? initialValue : showMask ? mask : '';

    const cachedProps = { mask, replacement, showMask, separate };
    cache = { value: initialValue, props: cachedProps, fallbackProps: cachedProps };

    return initialValue;
  };

  /**
   * Tracking
   */
  const tracking: TrackingFunction<MaskEventDetail> = ({
    inputType,
    previousValue,
    addedValue,
    changeStart,
    changeEnd,
  }) => {
    const { mask, replacement, showMask, separate, track, modify } = normalizeOptions(options);

    if (cache === null) {
      throw new SyntheticChangeError('The state has not been initialized.');
    }

    // Предыдущее значение всегда должно соответствовать маскированному значению из кэша. Обратная ситуация может
    // возникнуть при контроле значения, если значение не было изменено после ввода. Для предотвращения подобных
    // ситуаций, нам важно синхронизировать предыдущее значение с кэшированным значением, если они различаются
    if (cache.value !== previousValue) {
      cache.props = cache.fallbackProps;
    } else {
      cache.fallbackProps = cache.props;
    }

    // Дополнительно нам важно учесть, что немаскированное значение с учетом удаления или добавления символов должно
    // получаться с помощью закэшированных пропсов, то есть тех которые были применены к значению на момент предыдущего маскирования

    let beforeChangeValue = unformat(previousValue, {
      end: changeStart,
      mask: cache.props.mask,
      replacement: cache.props.replacement,
      separate: cache.props.separate,
    });

    // Регулярное выражение по поиску символов кроме ключей `replacement`
    const regExp$1 = RegExp(`[^${Object.keys(cache.props.replacement).join('')}]`, 'g');

    // Находим все заменяемые символы для фильтрации пользовательского значения.
    // Важно определить корректное значение на данном этапе
    const replacementChars = cache.props.mask.replace(regExp$1, '');

    if (beforeChangeValue) {
      beforeChangeValue = filter(beforeChangeValue, {
        replacementChars,
        replacement: cache.props.replacement,
        separate: cache.props.separate,
      });
    }

    const _addedValue = track?.({
      ...(inputType === 'insert' ? { inputType, data: addedValue } : { inputType, data: null }),
      value: previousValue,
      selectionStart: changeStart,
      selectionEnd: changeEnd,
    });

    if (_addedValue === false) {
      throw new SyntheticChangeError('Custom trekking stop.');
    } else if (_addedValue === null) {
      addedValue = '';
    } else if (_addedValue !== true && _addedValue !== undefined) {
      addedValue = _addedValue;
    }

    if (addedValue) {
      addedValue = filter(addedValue, {
        replacementChars: replacementChars.slice(beforeChangeValue.length),
        replacement: cache.props.replacement,
        separate: false, // Поскольку нас интересуют только "полезные" символы, фильтруем без учёта заменяемых символов
      });
    }

    if (inputType === 'insert' && addedValue === '') {
      throw new SyntheticChangeError('The character does not match the key value of the `replacement` object.');
    }

    let afterChangeValue = unformat(previousValue, {
      start: changeEnd,
      mask: cache.props.mask,
      replacement: cache.props.replacement,
      separate: cache.props.separate,
    });

    // Модифицируем `afterChangeValue` чтобы позиция символов не смещалась. Необходимо выполнять
    // после фильтрации `addedValue` и перед фильтрацией `afterChangeValue`
    if (cache.props.separate) {
      // Находим заменяемые символы в диапазоне изменяемых символов
      const separateChars = cache.props.mask.slice(changeStart, changeEnd).replace(regExp$1, '');

      // Получаем количество символов для сохранения перед `afterChangeValue`. Возможные значения:
      // `меньше ноля` - обрезаем значение от начала на количество символов;
      // `ноль` - не меняем значение;
      // `больше ноля` - добавляем заменяемые символы к началу значения.
      const countSeparateChars = separateChars.length - addedValue.length;

      if (countSeparateChars < 0) {
        afterChangeValue = afterChangeValue.slice(-countSeparateChars);
      } else if (countSeparateChars > 0) {
        afterChangeValue = separateChars.slice(-countSeparateChars) + afterChangeValue;
      }
    }

    if (afterChangeValue) {
      afterChangeValue = filter(afterChangeValue, {
        replacementChars: replacementChars.slice(beforeChangeValue.length + addedValue.length),
        replacement: cache.props.replacement,
        separate: cache.props.separate,
      });
    }

    const input = beforeChangeValue + addedValue + afterChangeValue;

    /* eslint-disable prefer-const */
    let {
      mask: modifiedMask = mask,
      replacement: modifiedReplacement = replacement,
      showMask: modifiedShowMask = showMask,
      separate: modifiedSeparate = separate,
    } = modify?.(input) ?? {};

    if (typeof modifiedReplacement === 'string') {
      modifiedReplacement = formatToReplacementObject(modifiedReplacement);
    }

    const detail = resolveDetail(input, {
      mask: modifiedMask,
      replacement: modifiedReplacement,
      showMask: modifiedShowMask,
    });

    const selection = resolveSelection({
      inputType,
      value: detail.value,
      addedValue,
      beforeChangeValue,
      // afterChangeValue,
      parts: detail.parts,
      replacement: modifiedReplacement,
      separate: modifiedSeparate,
    });

    cache.value = detail.value;
    cache.props = {
      mask: modifiedMask,
      replacement: modifiedReplacement,
      showMask: modifiedShowMask,
      separate: modifiedSeparate,
    };

    return {
      value: detail.value,
      selectionStart: selection,
      selectionEnd: selection,
      __detail: detail,
    };
  };

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const _this: Mask = Reflect.construct(Input, [{ eventType: 'mask', eventHandler, init, tracking }], this.constructor);

  context.set(_this, { onmask: null });

  return _this;
}

definePrototype(Mask, {
  get onmask() {
    return context.get(this as Mask).onmask ?? null;
  },
  set onmask(value) {
    context.get(this as Mask).onmask = value ?? null;
  },
});

Object.setPrototypeOf(Mask.prototype, Input.prototype);
Object.setPrototypeOf(Mask, Input);

export default Mask;