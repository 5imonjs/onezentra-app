'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function PermissionsPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/roles?tab=permissions');
  }, [router]);

  return null;
}
