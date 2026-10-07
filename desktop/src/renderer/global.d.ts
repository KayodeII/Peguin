/// <reference types="vite/client" />
import type { PeguinApi } from "../preload/app";

declare global {
  interface Window { penguin: PeguinApi }
}
