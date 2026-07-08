import React from "react";
import Field from "./Field";

export default function Input({ label, required, error, suffix, className = "", ...props }) {
  return (
    <Field label={label} required={required} error={error} className={className}>
      <span className="relative block">
        <input
          className={`h-10 w-full rounded-md border bg-gray-100 px-token-3 text-body2 text-text placeholder:text-gray-600 focus:border-primary focus:outline-none disabled:bg-surface disabled:text-text-muted ${
            error ? "border-danger" : "border-border"
          } ${suffix ? "pr-token-8" : ""}`}
          {...props}
        />
        {suffix && (
          <span className="absolute right-token-3 top-1/2 -translate-y-1/2 text-body2 text-text-muted">
            {suffix}
          </span>
        )}
      </span>
    </Field>
  );
}
