import { Toaster } from 'react-hot-toast'
import { Outlet } from 'react-router-dom'
import GlobalBackButton from './Components/Utils/GlobalBackButton'
import VersionChecker from './Components/Utils/VersionChecker'

function App() {
  return (
    <>
      <Toaster />
      <VersionChecker />
      <GlobalBackButton />
      <Outlet />
    </>
  )
}

export default App