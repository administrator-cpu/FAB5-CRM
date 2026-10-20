import React from 'react'

// inline: spinner inside the current panel (used while a lazy-loaded page downloads) instead of full screen.
function Loading({ inline = false }) {
  return (
    <div className={inline ? "py-24 flex items-center w-full justify-center" : "h-screen flex items-center fixed top-0 w-full justify-center"}>
        <div className="border-[10px] p-8 animate-spin rounded-full  border-[#cacaca] border-b-[#111]"></div>
    </div>
  )
}

export default Loading
