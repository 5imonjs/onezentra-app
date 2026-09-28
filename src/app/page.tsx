'use client';

import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/dashboard');
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="text-gray-500">Redirecting...</div>
    </div>
  );
}