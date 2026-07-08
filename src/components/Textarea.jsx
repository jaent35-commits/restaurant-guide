import React from "react";
import Field from "./Field";

export default function Textarea({ label, required, error, className = "", rows = 3, ...props }) {
  return (
    <Field label={label} required={required} error={error} className={className}>
      <textarea
        rows={rows}
        className={`w-full rounded-md border bg-gray-100 p-token-3 text-body2 text-text placeholder:text-gray-600 focus:border-primary focus:outline-none ${
          error ? "border-danger" : "border-border"
        }`}
        {...props}
      />
    </Field>
  );
}
