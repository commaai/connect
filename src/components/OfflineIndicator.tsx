import { ParentProps, createSignal, onCleanup } from 'solid-js'

const OfflineIndicator = (props: ParentProps) => {
  const [isOffline, setIsOffline] = createSignal(!navigator.onLine)

  const updateOnlineStatus = () => {
    setIsOffline(!navigator.onLine)
  }

  window.addEventListener('online', updateOnlineStatus)
  window.addEventListener('offline', updateOnlineStatus)

  onCleanup(() => {
    window.removeEventListener('online', updateOnlineStatus)
    window.removeEventListener('offline', updateOnlineStatus)
  })

  return (
    <div>
      {isOffline() ? (
        <div style={{ background: 'red', color: 'white', padding: '10px' }}>
          You are currently offline
        </div>
      ) : (
        props.children
      )}
    </div>
  )
}

export default OfflineIndicator
