import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';

export function useLoginSession() {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [isArtist, setIsArtist] = useState(false);

  useEffect(() => {
    let mounted = true;

    const syncSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      const user = data.session?.user ?? null;
      setUserEmail(user?.email ?? null);
      setUserId(user?.id ?? null);
      const name =
        (typeof user?.user_metadata?.name === 'string' && user.user_metadata.name) ||
        (typeof user?.user_metadata?.full_name === 'string' && user.user_metadata.full_name) ||
        '';
      setDisplayName(name);
      const artistFlag =
        typeof user?.user_metadata?.is_artist === 'boolean' ? user.user_metadata.is_artist : false;
      setIsArtist(artistFlag);
    };

    void syncSession();
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void syncSession();
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return {
    userEmail,
    setUserEmail,
    userId,
    setUserId,
    displayName,
    setDisplayName,
    isArtist,
    setIsArtist
  };
}
