import { createSignal, createMemo, onCleanup, onMount } from 'solid-js'
import { createStore, reconcile } from 'solid-js/store'
import { cancelUpload, getUploadQueue } from '~/api/athena'
import { getAthenaOfflineQueue } from '~/api/devices'
import type { UploadItem } from '~/types'
import { UploadQueueItem as AthenaOnlineUploadQueueItem, AthenaOfflineQueueItem } from '~/types'

const POLL_INTERVAL = 500
const ERROR_POLL_INTERVAL = 3000

export const useUploadQueue = (dongleId: string) => {
  const [items, setItems] = createStore<UploadItem[]>([])
  const [loading, setLoading] = createSignal(true)
  const [error, setError] = createSignal(false)
  const [offline, setOffline] = createSignal(false)
  const [isVisible, setIsVisible] = createSignal(document.visibilityState === 'visible')
  const [polling, setPolling] = createSignal(true)

  const pollInterval = createMemo(() => 
    error() || offline() ? ERROR_POLL_INTERVAL : POLL_INTERVAL
  )

  const processOfflineQueueData = (data: AthenaOfflineQueueItem[]): UploadItem[] =>
    data.flatMap(item =>
      item.params.files_data.map(file => ({
        id: file.fn,
        name: file.url.split('/').pop() || file.fn,
        uploadUrl: file.url,
        progress: 0,
        priority: file.priority,
        retryCount: 0,
        status: 'waiting_for_network' as const
      }))
    )

  const mapQueueData = (data: AthenaOnlineUploadQueueItem[]): UploadItem[] =>
    data.map(item => ({
      id: item.id,
      name: item.path.split('/').pop() || item.path,
      uploadUrl: item.url,
      progress: item.progress,
      priority: item.priority,
      retryCount: item.retry_count,
      status: getUploadStatus(item)
    }))

  const getUploadStatus = (item: AthenaOnlineUploadQueueItem | AthenaOfflineQueueItem): UploadItem['status'] => {
    if ('current' in item) {
      if (Math.round(item.progress * 100) === 100) return 'completed'
      if (item.current) return 'uploading'
      if (item.retry_count > 0) return 'error'
      return 'pending'
    }
    return 'waiting_for_network'
  }

  const fetchQueue = async (initialFetch: boolean = false) => {
    if (initialFetch) setLoading(true)
    
    try {
      const response = await getUploadQueue(dongleId)
      if (!response.queued) {
        setItems(reconcile(mapQueueData(response.result!)))
        setOffline(false)
        setError(false)
      }
    } catch (err) {
      console.error('Error fetching upload queue:', err)
      
      try {
        const offlineData = await getAthenaOfflineQueue(dongleId)
        setItems(reconcile(processOfflineQueueData(offlineData)))
        setOffline(true)
        setError(false)
      } catch (offlineErr) {
        console.error('Error fetching offline queue:', offlineErr)
        setError(true)
      }
    } finally {
      if (initialFetch) setLoading(false)
    }
  }

  const clearQueue = async () => {
    try {
      await cancelUpload(dongleId, items.map(item => item.id))
      await fetchQueue()
      return true
    } catch (err) {
      console.error('Error clearing queue:', err)
      setError(true)
      return false
    }
  }

  // Custom polling implementation that waits for fetch to complete before next interval
  let timeoutId: number | null = null;
  
  const poll = async () => {
    if (!isVisible() || !polling()) return;
    
    try {
      await fetchQueue(loading());
    } finally {
      if (polling() && isVisible()) {
        timeoutId = window.setTimeout(poll, pollInterval());
      }
    }
  };
  
  onMount(() => {
    // Start initial poll
    poll();
    
    // Handle visibility changes
    const handleVisibilityChange = () => {
      const visible = document.visibilityState === 'visible';
      setIsVisible(visible);
      
      // If becoming visible and not already polling, start polling
      if (visible && !timeoutId && polling()) {
        poll();
      }
    };
    
    window.addEventListener('visibilitychange', handleVisibilityChange);
    
    onCleanup(() => {
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      setPolling(false);
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    });
  });
  
  return {
    items,
    loading,
    error,
    offline,
    clearQueue
  }
}
