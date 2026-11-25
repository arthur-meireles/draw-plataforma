"use client";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef } from "react";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "./icon";
import { SuccessCheck } from "./motion";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-medium transition-[background-color,border-color,color,box-shadow] duration-150 disabled:pointer-events-none disabled:opacity-50 select-none",
  {
    variants: {
      variant: {
        primary: "bg-accent-solid text-accent-fg hover:bg-accent-solid-hover shadow-raised",
        secondary: "bg-layer-2 text-fg border border-line hover:bg-layer-hover hover:border-line-strong",
        ghost: "text-fg-muted hover:bg-layer-hover hover:text-fg",
        outline: "border border-line text-fg-muted hover:bg-layer-hover hover:text-fg",
        destructive: "bg-danger text-white hover:opacity-90 shadow-raised",
        "destructive-ghost": "text-danger hover:bg-danger-subtle",
        link: "text-accent hover:underline underline-offset-2 !px-0 h-auto !rounded-none",
      },
      size: {
        xs: "touch-target h-6 px-2.5 text-xs rounded-full",
        sm: "touch-target h-7 px-3 text-xs rounded-full max-md:h-8",
        md: "h-8 px-3.5 text-sm rounded-full",
        lg: "h-10 px-5 text-base rounded-full max-md:h-11",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Mantém o rótulo e mostra spinner; desabilita durante a requisição. */
  loading?: boolean;
  icon?: IconName;
  iconRight?: IconName;
  /** Confirmação breve após a requisição (✓ que se desenha + `successLabel`). Dirija com `useSuccessFlash()`. */
  success?: boolean;
  /** Rótulo mostrado durante `success` (padrão "Salvo"). */
  successLabel?: string;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, asChild, loading, icon, iconRight, children, disabled, type = "button", success, successLabel = "Salvo", onClick, ...props },
  ref,
) {
  const Comp = asChild ? Slot : "button";
  const iconSize = size === "xs" ? "xs" : size === "lg" ? "md" : "sm";
  if (asChild) {
    return (
      <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} onClick={onClick} {...props}>
        {children}
      </Comp>
    );
  }
  return (
    <Comp
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      aria-disabled={success || undefined}
      // durante a confirmação o botão não reenvia (sem esmaecer, para o ✓ ficar legível)
      onClick={success ? (e) => e.preventDefault() : onClick}
      {...props}
    >
      {success && !loading ? (
        <span key="success" className="motion-swap inline-flex items-center gap-1.5" role="status">
          <SuccessCheck size={iconSize === "xs" ? 12 : iconSize === "md" ? 16 : 14} />
          {successLabel}
        </span>
      ) : (
        <>
          {loading ? <Icon name="loading" size={iconSize} spin /> : icon ? <Icon name={icon} size={iconSize} /> : null}
          {children}
          {iconRight && !loading ? <Icon name={iconRight} size={iconSize} /> : null}
        </>
      )}
    </Comp>
  );
});

const iconButtonVariants = cva(
  "touch-target inline-flex items-center justify-center shrink-0 transition-[background-color,color] duration-150 disabled:pointer-events-none disabled:opacity-50 text-fg-subtle hover:text-fg",
  {
    variants: {
      variant: {
        ghost: "hover:bg-layer-hover",
        secondary: "border border-line bg-layer-2 hover:bg-layer-hover",
        primary: "bg-accent-solid text-accent-fg hover:bg-accent-solid-hover hover:text-accent-fg",
        destructive: "hover:bg-danger-subtle hover:text-danger",
      },
      size: {
        xs: "size-6 rounded-sm",
        sm: "size-7 rounded-md max-md:size-9",
        md: "size-8 rounded-md max-md:size-10",
        lg: "size-10 rounded-md max-md:size-11",
      },
    },
    defaultVariants: { variant: "ghost", size: "sm" },
  },
);

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof iconButtonVariants> {
  icon: IconName;
  /** Obrigatório: rótulo acessível (vira aria-label e title). */
  label: string;
  loading?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, variant, size, className, loading, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(iconButtonVariants({ variant, size }), className)}
      disabled={props.disabled || loading}
      {...props}
    >
      <Icon name={loading ? "loading" : icon} size={size === "lg" ? "md" : size === "xs" ? "xs" : "sm"} spin={loading} />
    </button>
  );
});
