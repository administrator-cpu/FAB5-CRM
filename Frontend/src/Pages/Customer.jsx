import React, { Suspense, useEffect, useState } from "react";
import Loading from "../Components/Utils/Loading";
import CustomerNavBar from "../Components/Navigation/CustomerNavBar";
import { Outlet, useParams } from "react-router-dom";
import { useCustomer } from "../Context/CustomerContext";
import CustomerCardSecond from "../Components/Dashboard/CustomerCardSecond";

function Customer() {
  const { customerInformation, getCustomerById } = useCustomer();
  const { id } = useParams();
  
  useEffect(() => {
    getCustomerById(id);
  }, [getCustomerById, id]);
  
  return (
    <main className="flex flex-col h-screen bg-zinc-100">
      <CustomerNavBar />
      <section className="flex-1 w-full  p-2 flex gap-2 ">
        <section className="h-[85vh] borer border-black customScroller flex-1 p-2 overflow-y-scroll">
          <Suspense fallback={<Loading inline />}>
            <Outlet />
          </Suspense>
        </section>
      </section>
    </main>
  );
}

export default Customer;