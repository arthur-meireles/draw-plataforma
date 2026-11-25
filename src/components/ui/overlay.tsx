"use client";
/** Overlays: Dialog (modal), Sheet (painel lateral / peek), ConfirmDialog, Popover, Tooltip, DropdownMenu. */
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { Button, IconButton } from "./button";
import { Icon, type IconName } from "./icon";
import { TextareaField } from "./input";

/* ───────── Dialog ───────── */
export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  /** Impede fechar ao clicar fora (formulários longos). */
  dismissible?: boolean;
  className?: string;
}

const dialogSizes = { sm: "sm:max-w-sm", md: "sm:max-w-lg", lg: "sm:max-w-2xl", xl: "sm:max-w-4xl" };

/** Modal centralizado no desktop; no celular vira folha em tela cheia. */
export function Dialog({ open, onOpenChange, title, description, children, footer, size = "md", dismissible = true, className }: DialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-backdrop animate-fade-in" />
        <DialogPrimitive.Content
          onInteractOutside={(e) => !dismissible && e.preventDefault()}
          className={cn(
            "fixed z-50 flex flex-col bg-surface text-fg shadow-overlay outline-none overscroll-contain",
            "inset-0 max-md:animate-slide-in-bottom max-md:pt-safe",
            "md:inset-auto md:left-1/2 md:top-[10vh] md:max-h-[80vh] md:w-full md:-translate-x-1/2 md:rounded-xl md:border md:border-line md:animate-scale-in",
            dialogSizes[size],
            className,
          )}
        >
          <div className="flex items-start gap-3 border-b border-line px-5 py-4">
            <div className="min-w-0 flex-1">
              <DialogPrimitive.Title className="font-display text-base font-bold text-fg">{title}</DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="mt-0.5 text-xs text-fg-subtle">{description}</DialogPrimitive.Description>
              ) : (
                <DialogPrimitive.Description className="sr-only">{typeof title === "string" ? title : "Diálogo"}</DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close asChild>
              <IconButton icon="close" label="Fechar" size="sm" className="-mr-1.5 -mt-0.5" />
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 scrollbar-thin">{children}</div>
          {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3 pb-safe max-md:[&>*]:flex-1">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/* ───────── Sheet (peek lateral estilo Plane) ───────── */
export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: React.ReactNode;
  /** Ações no cabeçalho (ex.: abrir em página, menu). */
  actions?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: "md" | "lg" | "xl";
  /** Título acessível quando `title` não é texto. */
  ariaTitle?: string;
}

const sheetWidths = { md: "md:w-[28rem]", lg: "md:w-[40rem]", xl: "md:w-[52rem]" };

export function Sheet({ open, onOpenChange, title, actions, children, footer, width = "lg", ariaTitle }: SheetProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-backdrop animate-fade-in md:bg-backdrop/40" />
        <DialogPrimitive.Content
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-line bg-surface shadow-overlay outline-none overscroll-contain animate-slide-in-right pt-safe",
            sheetWidths[width],
          )}
        >
          <div className="flex h-header shrink-0 items-center gap-2 border-b border-line px-4">
            <DialogPrimitive.Close asChild>
              <IconButton icon="close" label="Fechar painel" size="sm" />
            </DialogPrimitive.Close>
            <DialogPrimitive.Title className="min-w-0 flex-1 truncate text-sm font-medium text-fg-muted">{title ?? ariaTitle}</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">{ariaTitle ?? "Painel de detalhes"}</DialogPrimitive.Description>
            {actions}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">{children}</div>
          {footer && <div className="flex items-center justify-end gap-2 border-t border-line px-4 py-3 pb-safe">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/* ───────── ConfirmDialog ───────── */
export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  /** Exige motivo (ex.: perder cotação, pedir ajustes). */
  reason?: { label: string; placeholder?: string; required?: boolean };
  onConfirm: (reason?: string) => void;
  error?: string;
  /** Confirmação breve no botão após sucesso (ver `useSuccessFlash`). */
  success?: boolean;
  successLabel?: string;
}

/** Confirmação explícita para ações destrutivas ou com consequência. */
export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, cancelLabel = "Cancelar", destructive, loading, reason, onConfirm, error, success, successLabel }: ConfirmDialogProps) {
  const [text, setText] = useState("");
  const [touched, setTouched] = useState(false);
  const missing = !!reason?.required && !text.trim();
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setText("");
          setTouched(false);
        }
        onOpenChange(o);
      }}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? "destructive" : "primary"}
            loading={loading}
            success={success}
            successLabel={successLabel}
            onClick={() => {
              setTouched(true);
              if (missing) return;
              onConfirm(reason ? text.trim() : undefined);
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm text-fg-muted">
        {description && <div>{description}</div>}
        {reason && (
          <TextareaField
            label={reason.label}
            required={reason.required}
            placeholder={reason.placeholder}
            value={text}
            autoFocus
            onChange={(e) => setText(e.target.value)}
            error={(touched && missing ? "Explique o motivo para continuar" : undefined) ?? error}
            onSubmitShortcut={() => {
              setTouched(true);
              if (!missing) onConfirm(text.trim());
            }}
          />
        )}
        {!reason && error && <p className="text-xs text-danger">{error}</p>}
      </div>
    </Dialog>
  );
}

/* ───────── Popover ───────── */
export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;
export function PopoverContent({ className, align = "start", sideOffset = 6, ...props }: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        collisionPadding={12}
        className={cn("z-50 rounded-lg border border-line bg-layer-2 p-1 text-fg shadow-overlay outline-none animate-scale-in origin-[var(--radix-popover-content-transform-origin)]", className)}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

/* ───────── Tooltip ───────── */
export function TooltipProvider({ children }: { children: React.ReactNode }) {
  return <TooltipPrimitive.Provider delayDuration={300}>{children}</TooltipPrimitive.Provider>;
}

export function Tooltip({ content, children, side = "top" }: { content: React.ReactNode; children: React.ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  if (!content) return <>{children}</>;
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content side={side} sideOffset={6} className="z-[60] max-w-xs rounded-md bg-fg px-2 py-1 text-xs text-surface shadow-raised-2 animate-fade-in">
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

/* ───────── DropdownMenu ───────── */
export interface MenuItem {
  label: string;
  icon?: IconName;
  onSelect?: () => void;
  href?: string;
  destructive?: boolean;
  disabled?: boolean;
  shortcut?: string;
  separatorBefore?: boolean;
  hidden?: boolean;
}

export function DropdownMenu({ trigger, items, align = "end", label }: { trigger: React.ReactNode; items: MenuItem[]; align?: "start" | "end"; label?: string }) {
  const visible = items.filter((i) => !i.hidden);
  if (!visible.length) return null;
  return (
    <Dropdown.Root modal={false}>
      <Dropdown.Trigger asChild>{trigger}</Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content
          align={align}
          sideOffset={6}
          collisionPadding={12}
          className="z-50 min-w-48 rounded-lg border border-line bg-layer-2 p-1 shadow-overlay animate-scale-in origin-[var(--radix-dropdown-menu-content-transform-origin)]"
          onClick={(e) => e.stopPropagation()}
        >
          {label && <Dropdown.Label className="px-2 py-1.5 text-2xs font-medium uppercase tracking-wide text-fg-subtle">{label}</Dropdown.Label>}
          {visible.map((item, i) => (
            <div key={`${item.label}-${i}`}>
              {item.separatorBefore && i > 0 && <Dropdown.Separator className="my-1 h-px bg-line" />}
              <Dropdown.Item
                disabled={item.disabled}
                onSelect={() => {
                  if (item.href) window.location.assign(item.href); // menus raramente navegam; preferir onSelect + router
                  item.onSelect?.();
                }}
                className={cn(
                  "flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 max-md:py-2.5",
                  item.destructive ? "text-danger data-[highlighted]:bg-danger-subtle" : "text-fg-muted data-[highlighted]:bg-layer-hover data-[highlighted]:text-fg",
                )}
              >
                {item.icon && <Icon name={item.icon} size="sm" />}
                <span className="flex-1">{item.label}</span>
                {item.shortcut && <span className="text-2xs text-fg-subtle">{item.shortcut}</span>}
              </Dropdown.Item>
            </div>
          ))}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}

/** Botão "…" padrão de ações de linha/cartão. */
export function RowActions({ items, label = "Mais ações" }: { items: MenuItem[]; label?: string }) {
  return <DropdownMenu items={items} trigger={<IconButton icon="more" label={label} size="xs" onClick={(e) => e.stopPropagation()} />} />;
}
