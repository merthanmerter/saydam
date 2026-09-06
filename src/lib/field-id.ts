import { createContext, useContext } from "react";

/**
 * `Field`'in ürettiği kimlik. Girdi kutuları kimliği doğrudan alabildiği için
 * onlara kopyalanarak veriliyor; Radix `Select` gibi kendi DOM'unu üretmeyen
 * bileşenlerde ise asıl düğme alt seviyede olduğundan kimlik buradan okunur.
 */
export const FieldIdContext = createContext<string | undefined>(undefined);

export const useFieldId = () => useContext(FieldIdContext);
