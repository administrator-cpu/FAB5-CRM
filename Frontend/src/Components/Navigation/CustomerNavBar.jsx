import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { IoAdd } from "react-icons/io5";
import { useAuth } from '../../Context/AuthContext';

function CustomerNavBar() {
  const { id } = useParams();
  const {user}=useAuth()

  return (
    <nav className='w-full h-[10vh] flex items-center px-3 justify-between'>
<div className=""></div>
      {/* Dropdown Container */}
      {(user?.role=="employee"||user?.role=="admin")&&<div className='relative h-[65%] flex items-center'>
        {/* Toggle Button */}
        <Link 
        to={`/customer/${id}/create`} 
          className="border p-3 px-4 rounded-lg bg-[#fff] shadow-md flex gap-2 items-center cursor-pointer"
        >
          <IoAdd />Add New Connection
        </Link>
      </div>}
    </nav>
  );
}

export default CustomerNavBar;