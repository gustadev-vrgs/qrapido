import { zodResolver } from "@hookform/resolvers/zod";
import type { DefaultValues, FieldValues, UseFormProps } from "react-hook-form";
import type { z } from "zod";

export function makeFormConfig<TFieldValues extends FieldValues>(
  schema: z.ZodType<TFieldValues>,
  defaultValues: DefaultValues<TFieldValues>,
  options?: Omit<UseFormProps<TFieldValues>, "resolver" | "defaultValues">
): UseFormProps<TFieldValues> {
  return {
    ...options,
    resolver: zodResolver(schema),
    defaultValues,
    mode: "onBlur"
  };
}
