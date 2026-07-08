import React from "react";
import Field from "./Field";

/** options: [{ value, label, disabled? }] */
export default function Select({
  label,
  required,
  error,
  options = [],
  placeholder,
  className = "",
  ...props
}) {
  return (
    <Field label={label} required={required} error={error} className={className}>
      <select
        className={`h-10 w-full appearance-none rounded-md border bg-gray-100 px-token-3 text-body2 text-text focus:border-primary focus:outline-none disabled:bg-surface disabled:text-text-muted ${
          error ? "border-danger" : "border-border"
        }`}
        {...props}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}
