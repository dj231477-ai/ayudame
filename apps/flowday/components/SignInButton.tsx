'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

// Login con Google (Supabase Auth). SPEC §C-13.1 paso 3.
// No se piden scopes de Google Tasks aquí: conectar Tasks es opcional y posterior (§C-13.1 paso 6).
export function SignInButton() {
  const [loading, setLoading] = useState(false);

  const signIn = async () => {
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) setLoading(false);
  };

  return (
    <button
      type="button"
      onClick={signIn}
      disabled={loading}
      className="inline-flex items-center justify-center gap-2 rounded-xl bg-deep px-6 py-3 text-base font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-60"
    >
      {loading ? 'Conectando…' : 'Entrar con Google'}
    </button>
  );
}
