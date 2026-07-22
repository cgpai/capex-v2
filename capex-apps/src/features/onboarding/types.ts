export type PageTourPlacement = 'top' | 'bottom' | 'left' | 'right' | 'center';

export type PageTourStep = {
  id: string;
  /** Value of `data-tour` attribute. Omit for centered modal step. */
  target?: string;
  title: string;
  description: string;
  placement?: PageTourPlacement;
  /** Skip step when target element is not in DOM. */
  optional?: boolean;
};
