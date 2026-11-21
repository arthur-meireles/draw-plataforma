"use client";
import { createContext, useContext } from "react";

export interface LayoutState {
  openMobileNav: () => void;
  openCommand: () => void;
}

export const LayoutContext = createContext<LayoutState>({ openMobileNav: () => {}, openCommand: () => {} });
export const useLayout = () => useContext(LayoutContext);
