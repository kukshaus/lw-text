import { useCallback, useReducer } from "react";

export interface DocumentHistoryState {
  present: string;
  past: string[];
  future: string[];
}

type Action =
  | { type: "set"; value: string; record?: boolean }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset"; value: string };

const MAX_STEPS = 100;

function reducer(state: DocumentHistoryState, action: Action): DocumentHistoryState {
  switch (action.type) {
    case "reset":
      return { present: action.value, past: [], future: [] };
    case "set": {
      if (action.value === state.present) return state;
      if (action.record === false) return { ...state, present: action.value };
      return {
        present: action.value,
        past: [...state.past.slice(-(MAX_STEPS - 1)), state.present],
        future: [],
      };
    }
    case "undo": {
      if (!state.past.length) return state;
      const previous = state.past[state.past.length - 1]!;
      return {
        present: previous,
        past: state.past.slice(0, -1),
        future: [state.present, ...state.future],
      };
    }
    case "redo": {
      if (!state.future.length) return state;
      const next = state.future[0]!;
      return {
        present: next,
        past: [...state.past, state.present],
        future: state.future.slice(1),
      };
    }
    default:
      return state;
  }
}

export function useDocumentHistory(initial = "") {
  const [state, dispatch] = useReducer(reducer, {
    present: initial,
    past: [],
    future: [],
  });

  const setPresent = useCallback((value: string, opts?: { record?: boolean }) => {
    dispatch({ type: "set", value, record: opts?.record });
  }, []);

  const reset = useCallback((value: string) => {
    dispatch({ type: "reset", value });
  }, []);

  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);

  return {
    source: state.present,
    setPresent,
    reset,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
