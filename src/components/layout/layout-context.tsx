"use client";
import { createContext, useContext } from "react";

export interface LayoutState {
  openMobileNav: () => void;
  openCommand: () => void;
  /** 2º nível (sidebar) recolhido — preferência persistida por pessoa. */
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
}

export const LayoutContext = createContext<LayoutState>({ openMobileNav: () => {}, openCommand: () => {}, sidebarCollapsed: false, toggleSidebar: () => {} });
export const useLayout = () => useContext(LayoutContext);
