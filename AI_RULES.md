# AI Rules for Pokémon TCG Live Sale App

This document outlines the core technologies and best practices for developing this application.

## Tech Stack Overview

*   **React**: The primary JavaScript library for building user interfaces.
*   **TypeScript**: Used for type safety and improved code quality across the entire codebase.
*   **Vite**: The build tool for a fast development experience and optimized production builds.
*   **Tailwind CSS**: The utility-first CSS framework for all styling, ensuring a consistent and responsive design.
*   **shadcn/ui**: A collection of re-usable components built with Radix UI and Tailwind CSS, providing a consistent UI.
*   **React Router DOM**: For declarative client-side routing within the application.
*   **Supabase**: The backend-as-a-service providing database, authentication, and storage functionalities.
*   **TanStack Query (React Query)**: For efficient server state management, data fetching, caching, and synchronization.
*   **Sonner**: A modern toast library for displaying notifications to the user.
*   **Lucide React**: A library for easily integrating customizable SVG icons.
*   **Zod & React Hook Form**: Used together for robust form management and schema-based validation.

## Library Usage Rules

To maintain consistency and leverage the strengths of each library, please adhere to the following guidelines:

*   **UI Components**:
    *   Always prioritize `shadcn/ui` components for building the user interface.
    *   If a specific `shadcn/ui` component does not exist or requires significant customization, create a new component in `src/components/` using Tailwind CSS. **Do not modify `src/components/ui/` files directly.**
*   **Styling**:
    *   All styling must be done using **Tailwind CSS** classes.
    *   Avoid writing custom CSS in separate files, except for global styles defined in `src/index.css`.
*   **Routing**:
    *   Use `react-router-dom` for all client-side navigation.
    *   All main application routes should be defined in `src/App.tsx`.
*   **State Management & Data Fetching**:
    *   For server state (data fetched from Supabase) and complex asynchronous operations, use **TanStack Query**.
    *   For local component state, use React's `useState` and `useReducer` hooks.
*   **Backend Interaction**:
    *   All interactions with the database, storage, and authentication should be done via the `supabase` client imported from `src/integrations/supabase/client.ts`.
*   **Icons**:
    *   Use icons from the **`lucide-react`** library.
*   **Forms**:
    *   Implement all forms using **`react-hook-form`** for state management and validation.
    *   Use **`zod`** schemas for defining form validation rules.
*   **Notifications**:
    *   Use **`sonner`** for all toast notifications to provide user feedback.
*   **Utility Functions**:
    *   General utility functions that are not specific to a single component or hook should be placed in `src/lib/utils.ts`.
*   **Custom Hooks**:
    *   Any reusable logic encapsulated in a custom hook should reside in `src/hooks/`.