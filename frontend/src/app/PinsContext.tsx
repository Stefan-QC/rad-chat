import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { messageOf } from '../core/AppError';
import type { Channel, PinnedMessage } from '../core/types';
import { useChannelPermissions } from '../hooks/useChannelPermissions';
import { useToast } from '../components/ui/Toast';
import { useServices } from './ServicesContext';

interface PinsValue {
  pins: PinnedMessage[];
  canPin: boolean;
  isPinned: (messageId: number) => boolean;
  togglePin: (messageId: number) => Promise<void>;
}

const PinsContext = createContext<PinsValue | null>(null);

/** Houdt de vastgepinde berichten van één kanaal live bij en biedt pinnen en losmaken aan. */
export function PinsProvider({ channel, children }: { channel: Channel; children: ReactNode }) {
  const { pins: service } = useServices();
  const { canModerate } = useChannelPermissions(channel);
  const toast = useToast();
  const [pins, setPins] = useState<PinnedMessage[]>([]);

  const refresh = useCallback(() => {
    service.list(channel.id).then(setPins).catch(() => undefined);
  }, [service, channel.id]);

  useEffect(() => {
    refresh();
    return service.subscribe(channel.id, refresh);
  }, [service, channel.id, refresh]);

  const isPinned = useCallback((messageId: number) => pins.some(p => p.message_id === messageId), [pins]);

  const togglePin = useCallback(async (messageId: number) => {
    try {
      if (isPinned(messageId)) await service.unpin(messageId);
      else await service.pin(messageId);
      refresh();
    } catch (error) {
      toast.error(messageOf(error));
    }
  }, [isPinned, service, refresh, toast]);

  const value = useMemo(() => ({ pins, canPin: canModerate, isPinned, togglePin }), [pins, canModerate, isPinned, togglePin]);
  return <PinsContext.Provider value={value}>{children}</PinsContext.Provider>;
}

export function usePins(): PinsValue {
  const value = useContext(PinsContext);
  if (!value) throw new Error('usePins must be used inside PinsProvider');
  return value;
}
