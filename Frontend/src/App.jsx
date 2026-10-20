import { Suspense } from 'react'
import { Toaster } from 'react-hot-toast'
import { Outlet } from 'react-router-dom'
import GlobalBackButton from './Components/Utils/GlobalBackButton'
import VersionChecker from './Components/Utils/VersionChecker'
import Loading from './Components/Utils/Loading'

function App() {
  return (
    <>
      <Toaster />
      <VersionChecker />
      <GlobalBackButton />
      <Suspense fallback={<Loading />}>
        <Outlet />
      </Suspense>
    </>
  )
}

export default App