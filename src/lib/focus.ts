/** Move o foco para o primeiro campo inválido (após o React pintar os erros). */
export function focusFirstInvalid(root: ParentNode = document) {
  setTimeout(() => {
    const el = root.querySelector<HTMLElement>('[aria-invalid="true"]');
    el?.focus();
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, 30);
}
