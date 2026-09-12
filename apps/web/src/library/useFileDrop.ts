import { useEffect, useRef, useState } from 'react';

const MARKDOWN_FILE = /\.(markdown|md)$/i;

function isMarkdownFile(file: File): boolean {
  return MARKDOWN_FILE.test(file.name);
}

/**
 * Window-level drag-and-drop for .md import, active anywhere in the app.
 * Returns whether files are currently dragged over the window so callers can
 * show a drop affordance. Non-Markdown files never reach onFiles: they are
 * reported through onRejected so the drop names the problem instead of
 * failing silently (a mixed drop imports the Markdown and reports the rest).
 */
export function useFileDrop(
  onFiles: (files: File[]) => void,
  onRejected?: (files: File[]) => void,
): boolean {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const onFilesRef = useRef(onFiles);
  onFilesRef.current = onFiles;
  const onRejectedRef = useRef(onRejected);
  onRejectedRef.current = onRejected;

  useEffect(() => {
    const hasFiles = (event: DragEvent) =>
      Array.from(event.dataTransfer?.types ?? []).includes('Files');

    const onDragEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth.current += 1;
      setDragging(true);
    };
    const onDragOver = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault(); // required for the drop event to fire
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };
    const onDragLeave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    };
    const onDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth.current = 0;
      setDragging(false);
      const dropped = Array.from(event.dataTransfer?.files ?? []);
      const files = dropped.filter(isMarkdownFile);
      const rejected = dropped.filter((file) => !isMarkdownFile(file));
      if (files.length > 0) onFilesRef.current(files);
      if (rejected.length > 0) onRejectedRef.current?.(rejected);
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  return dragging;
}
