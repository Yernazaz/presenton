import React from 'react'
import { ConfigurationInitializer } from '../ConfigurationInitializer'
import ErrorConsole from './components/ErrorConsole'
const layout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div>
      <ConfigurationInitializer>
        {children}
      </ConfigurationInitializer>
      <ErrorConsole />
    </div>
  )
}

export default layout
