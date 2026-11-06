import React from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { PiRepeatFill } from "react-icons/pi";
import { useCustomer } from '../../Context/CustomerContext';

function Retain({info}) {
  const {cid,id}=useParams()
  const navigate=useNavigate()
  const {retention,getCustomerById}=useCustomer()
  const retain=()=>{
    retention(cid)
    getCustomerById(id)
    navigate(`/customer/${id}`)
  }

  return (
    <section className='h-full w-full flex justify-center mt-[10vh] relative items-center'>
      <div className="  rounded-lg  md:w-[40%] border shadow-[#98ff9850] shadow-xl border-[#88888818] p-4 flex flex-col gap-3 items-start">
       <h3 className='p-3  rounded-lg text-xl text-green-600 bg-[#c8ffcb38]'><PiRepeatFill/></h3>
       <div className="">
        <h4 className='font-semibold text-lg'>You want to retain customer ?</h4>
        <p className='text-sm'>Remove customer from disconnection. </p>
       </div>
       <div className="w-full flex gap-2 justify-end py-3">
        <Link to={`/customer/${id}`} className='px-5 rounded-md p-1 border border-zinc-400'>Cancel</Link>
        <button type="button" onClick={()=>retain()} className='px-5 rounded-md p-1 border bg-green-600 text-white border-green-400'>Retain</button>
       </div>


      </div>
    </section>
  )
}

export default Retain