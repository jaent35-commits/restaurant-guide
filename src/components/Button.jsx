import React from "react";

const VARIANTS = {
  primary:
    "bg-primary text-gray-100 hover:bg-primary-300 disabled:bg-gray-400 disabled:text-gray-100",
  secondary: "bg-gray-100 text-text border border-border hover:bg-surface disabled:text-gray-600",
  ghost: "bg-transparent text-text-muted hover:bg-surface disabled:text-gray-600",
  danger: "bg-danger text-gray-100 hover:opacity-90 disabled:bg-gray-400 disabled:text-gray-100",
};

const SIZES = {
  sm: "h-8 px-token-3 text-caption",
  md: "h-10 px-token-4 text-body2",
  lg: "h-12 px-token-5 text-body1",
};

export default function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...props
}) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-token-1 rounded-md font-bold transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
