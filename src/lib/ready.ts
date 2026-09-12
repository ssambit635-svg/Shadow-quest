/**
 * ready.ts — one boolean, shared without prop-drilling.
 *
 * Sections must not start their intro timelines while the boot curtain is up
 * (they'd finish unseen). Rather than each section polling for it, they read
 * this and gate their own `useIsomorphicLayoutEffect`.
 */
import { createContext, useContext } from "react";

export const ReadyContext = createContext(false);

/** True once the boot curtain has lifted. */
export const useReady = () => useContext(ReadyContext);
