"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  listContacts,
  createContact,
  updateContact,
  deleteContact,
} from "@/server/actions/contacts"

export function useContacts(query?: string) {
  const queryClient = useQueryClient()

  const contactsQuery = useQuery({
    queryKey: ["contacts", query],
    queryFn: () => listContacts(query),
    staleTime: 60 * 1000,
  })

  const createMutation = useMutation({
    mutationFn: ({ email, name }: { email: string; name?: string }) =>
      createContact(email, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      updateContact(id, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteContact(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] })
    },
  })

  return {
    contacts: contactsQuery.data ?? [],
    isLoading: contactsQuery.isLoading,
    create: createMutation.mutateAsync,
    update: updateMutation.mutateAsync,
    remove: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  }
}
