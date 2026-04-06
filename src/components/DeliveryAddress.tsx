import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { MapPin, Edit2, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface Address {
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  zip: string;
}

const STORAGE_KEY = "delivery-address";

const emptyAddress: Address = {
  street: "",
  number: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "",
  zip: "",
};

function loadAddress(): Address {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : emptyAddress;
  } catch {
    return emptyAddress;
  }
}

export const DeliveryAddress = () => {
  const [address, setAddress] = useState<Address>(loadAddress);
  const [editing, setEditing] = useState(!address.street);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(address));
  }, [address]);

  const update = (field: keyof Address, value: string) => {
    setAddress((prev) => ({ ...prev, [field]: value }));
  };

  const hasAddress = address.street && address.number && address.city;

  const save = () => {
    if (hasAddress) setEditing(false);
  };

  if (!editing && hasAddress) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-card rounded-xl border border-border p-3 flex items-start gap-3"
      >
        <MapPin size={18} className="text-primary shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-card-foreground">Endereço de entrega</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {address.street}, {address.number}
            {address.complement ? ` - ${address.complement}` : ""}
            <br />
            {address.neighborhood && `${address.neighborhood} · `}
            {address.city}/{address.state}
            {address.zip && ` · ${address.zip}`}
          </p>
        </div>
        <button onClick={() => setEditing(true)} className="text-muted-foreground hover:text-primary transition-colors p-1">
          <Edit2 size={14} />
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card rounded-xl border border-border p-4 space-y-3"
    >
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
        <MapPin size={13} />
        Endereço de Entrega
      </p>
      <div className="grid grid-cols-3 gap-2">
        <Input
          placeholder="Rua"
          value={address.street}
          onChange={(e) => update("street", e.target.value)}
          className="col-span-2 rounded-lg h-10 text-sm"
        />
        <Input
          placeholder="Nº"
          value={address.number}
          onChange={(e) => update("number", e.target.value)}
          className="rounded-lg h-10 text-sm"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input
          placeholder="Complemento"
          value={address.complement}
          onChange={(e) => update("complement", e.target.value)}
          className="rounded-lg h-10 text-sm"
        />
        <Input
          placeholder="Bairro"
          value={address.neighborhood}
          onChange={(e) => update("neighborhood", e.target.value)}
          className="rounded-lg h-10 text-sm"
        />
      </div>
      <div className="grid grid-cols-5 gap-2">
        <Input
          placeholder="Cidade"
          value={address.city}
          onChange={(e) => update("city", e.target.value)}
          className="col-span-2 rounded-lg h-10 text-sm"
        />
        <Input
          placeholder="UF"
          value={address.state}
          onChange={(e) => update("state", e.target.value)}
          className="rounded-lg h-10 text-sm"
          maxLength={2}
        />
        <Input
          placeholder="CEP"
          value={address.zip}
          onChange={(e) => update("zip", e.target.value)}
          className="col-span-2 rounded-lg h-10 text-sm"
        />
      </div>
      <Button
        onClick={save}
        disabled={!hasAddress}
        className="w-full h-10 rounded-xl bg-primary text-primary-foreground font-semibold text-sm gap-2"
      >
        <Check size={16} />
        Salvar Endereço
      </Button>
    </motion.div>
  );
};
