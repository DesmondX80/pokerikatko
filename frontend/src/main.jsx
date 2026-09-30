import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App' // Voit jättää päätteen pois, jotta se hakee App.tsx:n automaattisesti
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
)