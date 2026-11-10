import { cushn } from "./client";
import { useInvalidatingMutation } from "./mutation";

/** `mutate({ filePath })` shows a file saved this session (an export) in Finder, Explorer or the file manager. */
export function useRevealFile() {
  return useInvalidatingMutation(cushn.files.reveal, []);
}
