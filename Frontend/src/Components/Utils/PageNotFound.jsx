import React from 'react'
import { useNavigate } from 'react-router-dom'

function PageNotFound() {
    const navigate=useNavigate()
  return (
    <div className='h-screen w-full flex flex-col justify-center items-center gap-10'>
        <h1 className='text-9xl font-bold'>Are you lost ?</h1>
        <button type="button"  onClick={()=>navigate(`/`)} className=' shadow-lg hover:shadow-md transition-all duration-200 hover:shadow-[#858585] shadow-[#858585] px-10 rounded-xl font-semibold  p-4 bg-[#0e0e0e] flex gap-2 items-center  text-[#f1f1f1]'>Go to Home </button>

    </div>
  )
}

export default PageNotFound