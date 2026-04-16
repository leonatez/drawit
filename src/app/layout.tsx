import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from 'react-hot-toast';

export const metadata: Metadata = {
  title: 'DrawIt – AI Image Editor',
  description: 'Collaborative AI-powered image editing canvas',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        {children}
        <Toaster
          position="bottom-center"
          toastOptions={{
            style: {
              background: '#2a2a3e',
              color: '#cdd6f4',
              border: '1px solid #3a3a4e',
            },
          }}
        />
      </body>
    </html>
  );
}
