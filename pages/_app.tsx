import { ClerkProvider } from '@clerk/nextjs';
import type { AppProps } from 'next/app';
import '../styles/globals.css';
import 'react-datepicker/dist/react-datepicker.css';

// Wrapping the entire application with ClerkProvider to enable authentication features across all pages.
export default function MyApp({ Component, pageProps }: AppProps) {
  return (
    <ClerkProvider {...pageProps}>
      <Component {...pageProps} />
    </ClerkProvider>
  );
}