import { createContext, useContext } from "react";

/** Review switches passed through the composition props (e.g. "nocam" shows the whole console window). */
export const DebugCtx = createContext<string>("");
export const useDebug = () => useContext(DebugCtx);
