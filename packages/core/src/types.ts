export interface CustomInputEvent<D = unknown> extends CustomEvent<D> {
  target: EventTarget & HTMLInputElement;
}

export type CustomInputEventHandler<E extends CustomInputEvent> = {
  bivarianceHack(event: E): void;
}['bivarianceHack'];

export type InputType = 'insert' | 'deleteBackward' | 'deleteForward';

export interface InputAttributes {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

export type InitFunction = (param: { initialValue: string; controlled: boolean }) => string;

export type TrackingFunction<D = unknown> = (param: {
  inputType: InputType;
  value: string;
  addedValue: string;
  deletedValue: string;
  previousValue: string;
  changeStart: number;
  changeEnd: number;
  selectionStart: number;
  selectionEnd: number;
}) => InputAttributes & { __detail?: D };

export interface InputOptions<D> {
  init: InitFunction;
  tracking: TrackingFunction<D>;
  eventType?: string;
  eventHandler?: CustomInputEventHandler<CustomInputEvent<D>>;
}

export type InputComponentProps<C extends React.ComponentType | undefined = undefined> = {
  /** **Not used in the hook**. Serves to enable the use of custom components, for example, if you want to use your own styled component with the ability to format the value. */
  component?: C;
} & (C extends React.ComponentType<infer P> ? P : React.InputHTMLAttributes<HTMLInputElement>);

// https://github.com/GoncharukBro/react-input/issues/15
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type InputComponent<P extends object> = <C extends React.ComponentType<any> | undefined = undefined>(
  props: P & InputComponentProps<C> & React.RefAttributes<HTMLInputElement>,
) => JSX.Element;
