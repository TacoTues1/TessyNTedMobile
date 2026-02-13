import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

/**
 * A hook to subscribe to realtime changes on specific tables.
 * @param tables Array of table names to listen to.
 * @param callback Function to call when a change occurs.
 * @param enabled Whether the subscription should be active.
 */
export function useRealtime(tables: string[], callback: () => void, enabled: boolean = true) {
    // Use ref to always have the latest callback without re-subscribing
    const callbackRef = useRef(callback);
    callbackRef.current = callback;

    // Stable key for the tables array
    const tablesKey = tables.join(',');

    useEffect(() => {
        if (!enabled || tables.length === 0) return;

        let retryTimeout: ReturnType<typeof setTimeout> | null = null;
        let currentChannel: ReturnType<typeof supabase.channel> | null = null;
        let isCancelled = false;

        const createSubscription = () => {
            if (isCancelled) return;

            // Use a stable channel name based on tables (no Date.now())
            const channelName = `realtime_${tablesKey.replace(/,/g, '_')}`;

            console.log(`Subscribing to realtime changes for: ${tables.join(', ')}`);

            const channel = supabase.channel(channelName);
            currentChannel = channel;

            tables.forEach(table => {
                channel.on(
                    'postgres_changes',
                    { event: '*', schema: 'public', table },
                    (payload) => {
                        console.log(`Realtime change detected in ${table}:`, payload.eventType);
                        callbackRef.current();
                    }
                );
            });

            channel.subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log(`Successfully subscribed to ${tables.join(', ')}`);
                }
                if (status === 'CHANNEL_ERROR') {
                    console.warn(`Channel error for ${tables.join(', ')}, retrying in 3s...`);
                    // Clean up and retry after a delay
                    if (!isCancelled) {
                        supabase.removeChannel(channel);
                        currentChannel = null;
                        retryTimeout = setTimeout(() => {
                            if (!isCancelled) createSubscription();
                        }, 3000);
                    }
                }
            });
        };

        createSubscription();

        return () => {
            isCancelled = true;
            if (retryTimeout) clearTimeout(retryTimeout);
            if (currentChannel) {
                console.log(`Unsubscribing from ${tables.join(', ')}`);
                supabase.removeChannel(currentChannel);
            }
        };
    }, [tablesKey, enabled]);
}
