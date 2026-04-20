'use client';

// Admin panel is surfaced as a modal from the main page.
// This route provides a direct URL for bookmarking.
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to home and open admin modal
    router.replace('/?admin=1');
  }, [router]);

  return (
    <div className="flex items-center justify-center h-screen bg-[#0f172a] text-[#64748b] text-sm">
      Redirecting…
    </div>
  );
}
