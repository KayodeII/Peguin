/// <reference types="vite/client" />
import type { PenguinApi } from "../preload/app";

declare global {
  interface Window { penguin: PenguinApi }
}
