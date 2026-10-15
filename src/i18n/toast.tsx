import { toast as sonnerToast } from "sonner";
import { localizedToast } from "./LocalizedToast";

const messageMethods = new Set(["success", "error", "info", "warning", "loading", "message"]);
/** Translate only notification copy at display time; never mutate API errors. */
export const toast: typeof sonnerToast = new Proxy(sonnerToast, {
  apply(target, thisArg, args) {
    const [message, ...options] = args;
    return Reflect.apply(target, thisArg, [
      localizedToast(() => (typeof message === "function" ? message() : message)),
      ...options,
    ]);
  },
  get(target, property, receiver) {
    const value = Reflect.get(target, property, receiver);
    if (typeof property !== "string" || !messageMethods.has(property)) return value;
    return (message: Parameters<typeof sonnerToast>[0], ...options: unknown[]) =>
      Reflect.apply(value, target, [
        localizedToast(() => (typeof message === "function" ? message() : message)),
        ...options,
      ]);
  },
});
