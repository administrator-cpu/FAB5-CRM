import { LogOut } from 'lucide-react'
import React, { useState } from 'react'
import { useAuth } from '../../Context/AuthContext'

function Logout() {
    const [panal,setPanal]=useState(false)
    const {logout}=useAuth()
  return (
    <div className=' flex justify-center items-center '>
        <button className="cursor-pointer" type="button" onClick={()=>{setPanal(true)}}>
            <LogOut size={18}/>
        </button>
        {panal&&
        <div className="fixed top-0 p-2 left-0 h-screen w-full flex justify-center items-center z-50 bg-[#0000001f] ">
        
         <div className="  rounded-lg bg-white  w-full md:w-[50%] lg:w-[30%] border shadow-[#ff989850] shadow-xl border-[#88888818] p-4 flex flex-col gap-3 items-start">
       <h3 className='p-3  rounded-lg text-xl text-red-600 bg-[#ffc8c838]'><LogOut/></h3>
       <div className="">
        <h4 className='font-semibold text-lg'>Are you sure you want to logout ?</h4>
        <p className='text-sm'>You will be logged out from the Dashboard Login again anytime. </p>
       </div>
       <div className="w-full flex gap-2 justify-end py-3">
        <button type="button" onClick={()=>{setPanal(false)}} className='px-5 rounded-md p-1 border border-zinc-400'>Cancel</button>
        <button type="button" onClick={()=>{
          logout()
          setPanal(false)
          }} className='px-5 rounded-md p-1 border bg-red-600 text-white border-red-400'>Logout</button>
       </div>


      </div>

        </div>}
        
    </div>
  )
}

export default Logout