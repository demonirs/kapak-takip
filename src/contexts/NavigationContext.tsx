/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import {
  useLocation,
  useNavigate,
  useNavigationType,
} from 'react-router-dom';
import UnsavedChangesDialog from '../components/UnsavedChangesDialog';

export type NavigationDirection = 'forward' | 'back';

type BackLayer = {
  id: string;
  priority: number;
  isActive: () => boolean;
  close: () => void | Promise<void>;
};

type DirtyGuard = {
  id: string;
  isDirty: () => boolean;
};

type NavigationContextValue = {
  direction: NavigationDirection;
  requestBack: () => void;
  requestLeave: (action: () => void) => void;
  registerBackLayer: (layer: BackLayer) => () => void;
  registerDirtyGuard: (guard: DirtyGuard) => () => void;
};

const NavigationContext = createContext<NavigationContextValue | null>(null);

const STACK_STORAGE_KEY = 'kavis-navigation-stack-v1';
const SESSION_STORAGE_KEY = 'kavis-navigation-session-v1';
const EXIT_WINDOW_MS = 2000;
const IGNORED_PATHS = new Set(['/login', '/reset-password']);

function routeValue(pathname: string, search: string, hash: string) {
  return `${pathname}${search}${hash}`;
}

type StoredNavigationSession = {
  id: string;
  stack: string[];
};

function createSessionId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function loadStoredSession(currentRoute: string) {
  try {
    const storedSession = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    const storedStack = window.sessionStorage.getItem(STACK_STORAGE_KEY);
    const parsedSession = storedSession
      ? (JSON.parse(storedSession) as unknown)
      : null;
    const parsedStack = storedStack ? (JSON.parse(storedStack) as unknown) : null;
    const historySessionId = (window.history.state as {
      kavisSessionId?: unknown;
    } | null)?.kavisSessionId;

    if (
      typeof parsedSession === 'string' &&
      parsedSession === historySessionId &&
      Array.isArray(parsedStack) &&
      parsedStack.every(item => typeof item === 'string') &&
      parsedStack[parsedStack.length - 1] === currentRoute
    ) {
      return {
        id: parsedSession,
        stack: parsedStack as string[],
      } satisfies StoredNavigationSession;
    }
  } catch {
    // Corrupt or unavailable session storage starts a fresh safe stack.
  }

  return {
    id: createSessionId(),
    stack: [currentRoute],
  } satisfies StoredNavigationSession;
}

export function NavigationProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const currentRoute = routeValue(
    location.pathname,
    location.search,
    location.hash
  );

  const [direction, setDirection] =
    useState<NavigationDirection>('forward');
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [exitMessageVisible, setExitMessageVisible] = useState(false);

  const stackRef = useRef<string[]>([]);
  const sessionIdRef = useRef('');
  const initializedRef = useRef(false);
  const layersRef = useRef(new Map<string, BackLayer>());
  const dirtyGuardsRef = useRef(new Map<string, DirtyGuard>());
  const handlingBackRef = useRef(false);
  const exitDeadlineRef = useRef(0);
  const exitTimerRef = useRef<number | null>(null);
  const pendingLeaveActionRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (IGNORED_PATHS.has(location.pathname)) {
      stackRef.current = [];
      sessionIdRef.current = '';
      initializedRef.current = false;
      window.sessionStorage.removeItem(STACK_STORAGE_KEY);
      window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
      return;
    }

    if (!initializedRef.current) {
      const session = loadStoredSession(currentRoute);
      sessionIdRef.current = session.id;
      stackRef.current = session.stack;
      initializedRef.current = true;
    } else if (navigationType === 'PUSH') {
      stackRef.current = [...stackRef.current, currentRoute].slice(-40);
      setDirection('forward');
    } else if (navigationType === 'REPLACE') {
      stackRef.current = stackRef.current.length
        ? [...stackRef.current.slice(0, -1), currentRoute]
        : [currentRoute];
      setDirection('forward');
    } else {
      let previousIndex = -1;

      for (let index = stackRef.current.length - 2; index >= 0; index -= 1) {
        if (stackRef.current[index] === currentRoute) {
          previousIndex = index;
          break;
        }
      }

      stackRef.current =
        previousIndex >= 0
          ? stackRef.current.slice(0, previousIndex + 1)
          : [currentRoute];
      setDirection('back');
    }

    window.sessionStorage.setItem(
      STACK_STORAGE_KEY,
      JSON.stringify(stackRef.current)
    );
    window.sessionStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify(sessionIdRef.current)
    );

    window.history.replaceState(
      {
        ...(window.history.state ?? {}),
        kavisSessionId: sessionIdRef.current,
        kavisDepth: stackRef.current.length,
      },
      ''
    );
  }, [currentRoute, location.pathname, navigationType]);

  useEffect(() => {
    return () => {
      if (exitTimerRef.current !== null) {
        window.clearTimeout(exitTimerRef.current);
      }
    };
  }, []);

  const registerBackLayer = useCallback((layer: BackLayer) => {
    layersRef.current.set(layer.id, layer);

    return () => {
      layersRef.current.delete(layer.id);
    };
  }, []);

  const registerDirtyGuard = useCallback((guard: DirtyGuard) => {
    dirtyGuardsRef.current.set(guard.id, guard);

    return () => {
      dirtyGuardsRef.current.delete(guard.id);
    };
  }, []);

  const hasUnsavedChanges = useCallback(() => {
    return Array.from(dirtyGuardsRef.current.values()).some(guard =>
      guard.isDirty()
    );
  }, []);

  const performRouteBack = useCallback(() => {
    if (stackRef.current.length > 1) {
      setDirection('back');
      navigate(-1);
      return;
    }

    if (location.pathname !== '/') {
      setDirection('back');
      navigate('/', { replace: true });
      return;
    }

    if (
      !Capacitor.isNativePlatform() ||
      Capacitor.getPlatform() !== 'android'
    ) {
      return;
    }

    const now = Date.now();

    if (now <= exitDeadlineRef.current) {
      void CapacitorApp.exitApp();
      return;
    }

    exitDeadlineRef.current = now + EXIT_WINDOW_MS;
    setExitMessageVisible(true);

    if (exitTimerRef.current !== null) {
      window.clearTimeout(exitTimerRef.current);
    }

    exitTimerRef.current = window.setTimeout(() => {
      exitDeadlineRef.current = 0;
      setExitMessageVisible(false);
      exitTimerRef.current = null;
    }, EXIT_WINDOW_MS);
  }, [location.pathname, navigate]);

  const requestLeave = useCallback(
    (action: () => void) => {
      if (hasUnsavedChanges()) {
        pendingLeaveActionRef.current = action;
        setLeaveDialogOpen(true);
        return;
      }

      action();
    },
    [hasUnsavedChanges]
  );

  const requestBack = useCallback(() => {
    if (handlingBackRef.current || leaveDialogOpen) return;

    const activeLayer = Array.from(layersRef.current.values())
      .filter(layer => layer.isActive())
      .sort((first, second) => second.priority - first.priority)[0];

    if (activeLayer) {
      handlingBackRef.current = true;

      Promise.resolve(activeLayer.close()).finally(() => {
        handlingBackRef.current = false;
      });
      return;
    }

    if (hasUnsavedChanges()) {
      pendingLeaveActionRef.current = performRouteBack;
      setLeaveDialogOpen(true);
      return;
    }

    performRouteBack();
  }, [hasUnsavedChanges, leaveDialogOpen, performRouteBack]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;

    let disposed = false;
    let removeListener: (() => Promise<void>) | null = null;

    void CapacitorApp.addListener('backButton', () => {
      requestBack();
    }).then(handle => {
      if (disposed) {
        void handle.remove();
      } else {
        removeListener = () => handle.remove();
      }
    });

    return () => {
      disposed = true;
      if (removeListener) void removeListener();
    };
  }, [requestBack]);

  const value = useMemo<NavigationContextValue>(
    () => ({
      direction,
      requestBack,
      requestLeave,
      registerBackLayer,
      registerDirtyGuard,
    }),
    [
      direction,
      registerBackLayer,
      registerDirtyGuard,
      requestBack,
      requestLeave,
    ]
  );

  return (
    <NavigationContext.Provider value={value}>
      {children}

      <UnsavedChangesDialog
        open={leaveDialogOpen}
        onContinueEditing={() => {
          pendingLeaveActionRef.current = null;
          setLeaveDialogOpen(false);
        }}
        onLeave={() => {
          const pendingAction = pendingLeaveActionRef.current;
          pendingLeaveActionRef.current = null;
          setLeaveDialogOpen(false);
          pendingAction?.();
        }}
      />

      {exitMessageVisible && (
        <div
          className="fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-[230] mx-auto w-fit rounded-xl border border-cyan-400/25 bg-slate-950/95 px-4 py-3 text-sm font-semibold text-cyan-100 shadow-2xl"
          role="status"
          aria-live="polite"
        >
          Çıkmak için geri tuşuna tekrar basın
        </div>
      )}
    </NavigationContext.Provider>
  );
}

export function useKavisNavigation() {
  const context = useContext(NavigationContext);

  if (!context) {
    throw new Error(
      'useKavisNavigation must be used inside NavigationProvider.'
    );
  }

  return context;
}

export function useBackLayer(
  id: string,
  priority: number,
  active: boolean,
  close: () => void | Promise<void>
) {
  const { registerBackLayer } = useKavisNavigation();
  const activeRef = useRef(active);
  const closeRef = useRef(close);

  activeRef.current = active;
  closeRef.current = close;

  useEffect(
    () =>
      registerBackLayer({
        id,
        priority,
        isActive: () => activeRef.current,
        close: () => closeRef.current(),
      }),
    [id, priority, registerBackLayer]
  );
}

export function useUnsavedChanges(id: string, dirty: boolean) {
  const { registerDirtyGuard } = useKavisNavigation();
  const dirtyRef = useRef(dirty);

  dirtyRef.current = dirty;

  useEffect(
    () =>
      registerDirtyGuard({
        id,
        isDirty: () => dirtyRef.current,
      }),
    [id, registerDirtyGuard]
  );

  useEffect(() => {
    if (!dirty) return undefined;

    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [dirty]);
}
