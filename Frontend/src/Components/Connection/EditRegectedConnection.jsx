import React, { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useConnection } from '../../Context/ConnectionContext'
import EditIpConnection from './EditIpConnection'
import EditServiceConnection from './EditServiceConnection'

function EditRegectedConnection() {
    const {id,cid}=useParams()
    const {getConnectionById,singleConnectionData}=useConnection()
    useEffect(()=>{
        getConnectionById(cid)
    },[cid,getConnectionById])

    if (singleConnectionData?.serviceType==="IP") {
          return <EditIpConnection/>
    }
    else{
        return <EditServiceConnection/>
    }
    

}

export default EditRegectedConnection