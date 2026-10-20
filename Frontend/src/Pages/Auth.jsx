import { Suspense } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import Loading from "../Components/Utils/Loading";
import {InputUnit} from "../Components/Utils/InputUnit";
import { MdCheckBoxOutlineBlank } from "react-icons/md";

function Auth() {
  const location = useLocation();
  const para = location.pathname.includes(`login`)
    ? "Welcome back! Glad to see you, Again!"
    : location.pathname.includes(`varification`)
    ? "Hello! Verify Code to get started"
    : location.pathname.includes(`reset`)
    ? ` Reset password to get started`
    : `Hello! Create account to get started`;

  return (
    <main className="h-screen w-full flex justify-center items-center bg-[#EBEDEC]">
      <section className="h-[95%] border-black  bg-white rounded-[38px] flex justify-between w-[95%] md:w-[60%] p-2">
        <aside className="h-full w-[48%]  rounded-[30px] bg-[#111] p-8 justify-between hidden md:flex flex-col text-white">
          <div className="w-[80%] flex items-center gap-3 uppercase ">
            start with <div className="border-b flex-1"></div>
          </div>
          <div className="w-[80%]">
            <h1 className="font-serif font-thin text-4xl">{para}</h1>
            {/* <p className="text-[10px] flex flex-col leading-[1.1] pt-2">
              <span>Developed by : {`</> Harsh Jha`}</span>
              <span>Powerd by : {`</Div>`}</span>
            </p> */}
          </div>
        </aside>
        <section className="h-full md:w-[51%]  w-full rounded-[30px] flex flex-col justify-between items-center">
          <div className="p-2">{``}</div>
          <Suspense fallback={<Loading inline />}>
            <Outlet/>
          </Suspense>
        </section>
      </section>
    </main>
  );
}

export default Auth;
