import type { Variants } from "framer-motion";

export const fadeUpMotion: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } }
};

export const staggerContainerMotion: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } }
};
