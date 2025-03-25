"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"
import { HeroUIProvider } from "@heroui/react"
import type { SessionValidationResult } from "@/types"
import { useSessionStore } from "@/state/session"
import { Suspense, useEffect, useRef, RefObject } from "react"
import { useConfigStore } from "@/state/config"
import type { getConfig } from "@/flags"
import { EmailVerificationDialog } from "./email-verification-dialog"
import { useTopLoader } from 'nextjs-toploader'
import { usePathname, useRouter, useSearchParams, useParams } from "next/navigation"
import { useEventListener } from 'usehooks-ts';
import { useDebounceCallback } from 'usehooks-ts'

function RouterChecker() {
  const { start, done } = useTopLoader()
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const params = useParams();
  const refetchSession = useSessionStore((store) => store.refetchSession)

  useEffect(() => {
    const _push = router.push.bind(router);
    const _refresh = router.refresh.bind(router);

    // Monkey patch: https://github.com/vercel/next.js/discussions/42016#discussioncomment-9027313
    router.push = (href, options) => {
      start();
      _push(href, options);
    };

    // Monkey patch: https://github.com/vercel/next.js/discussions/42016#discussioncomment-9027313
    router.refresh = () => {
      start();
      refetchSession();
      _refresh();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    done();
    refetchSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams, params]);

  return null;
}

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  const setSession = useSessionStore((store) => store.setSession)
  const setConfig = useConfigStore((store) => store.setConfig)
  const isLoading = useSessionStore((store) => store.isLoading)
  const clearSession = useSessionStore((store) => store.clearSession)
  const refetchSession = useSessionStore((store) => store.refetchSession)
  const documentRef = useRef(typeof window === 'undefined' ? null : document)
  const windowRef = useRef(typeof window === 'undefined' ? null : window)
  const fetchSession = useDebounceCallback(async () => {
    try {
      const response = await fetch('/api/get-session')
      const sessionWithConfig = await response.json() as {
        session: SessionValidationResult
        config: Awaited<ReturnType<typeof getConfig>>
      }

      setConfig(sessionWithConfig?.config)

      if (sessionWithConfig?.session) {
        setSession(sessionWithConfig?.session)
      } else {
        clearSession()
      }
    } catch (error) {
      console.error('Failed to fetch session:', error)
      clearSession()
    }
  }, 30)

  useEffect(() => {
    if (isLoading) {
      fetchSession()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading])

  useEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      refetchSession()
    }
  }, documentRef as RefObject<Document>)

  useEventListener('focus', () => {
    refetchSession()
    // @ts-expect-error window is not defined in the server
  }, windowRef)

  return (
    <HeroUIProvider>
      <Suspense>
        <RouterChecker />
      </Suspense>
      <NextThemesProvider {...props} attribute="class">
        {children}
        <EmailVerificationDialog />
      </NextThemesProvider>
    </HeroUIProvider>
  )
}
