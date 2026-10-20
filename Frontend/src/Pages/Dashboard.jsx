import { Suspense } from 'react';
import NavBar from '../Components/Navigation/NavBar';
import Loading from '../Components/Utils/Loading';
import { Outlet } from 'react-router-dom';
import { useDashboard } from '../Context/DashboardContext';


function Dashboard() {
      const { metrics } = useDashboard();
  
  
  return (
    <main className='h-screen bg-gray-50 flex w-full   '>
      <NavBar counts={metrics?.performance}/>
      <Suspense fallback={<Loading inline />}>
        <Outlet/>
      </Suspense>
      

    </main>
  )
}

export default Dashboard