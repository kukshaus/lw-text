import { BoxSizeField, type BoxSizeFieldProps } from "./BoxSizeField";

/** @deprecated Use BoxSizeField */
export function ImageSizeField(props: Omit<BoxSizeFieldProps, "variant">) {
  return <BoxSizeField {...props} variant="image" />;
}
