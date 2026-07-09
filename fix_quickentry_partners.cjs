const fs = require('fs');

let code = fs.readFileSync('src/components/QuickEntry.tsx', 'utf-8');

// 1. Add Customer and Supplier imports if they are not there
if (!code.includes('Customer, Supplier')) {
    code = code.replace(/import \{.*?\} from "\.\.\/types";/, match => {
        if (!match.includes('Customer')) match = match.replace('}', ', Customer }');
        if (!match.includes('Supplier')) match = match.replace('}', ', Supplier }');
        return match;
    });
}

// 2. Add state variables
const stateInsertion = `    const [cashBoxes, setCashBoxes] = useState<CashBox[]>([]);`;
const newState = `    const [cashBoxes, setCashBoxes] = useState<CashBox[]>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    
    const [selectedPartnerId, setSelectedPartnerId] = useState("");
    const [isNewPartner, setIsNewPartner] = useState(false);
    const [searchPartnerTerm, setSearchPartnerTerm] = useState("");
    const [showPartnerSuggestions, setShowPartnerSuggestions] = useState(false);`;
code = code.replace(stateInsertion, newState);

// 3. Update init()
const initMatch = `                const [boxes, allSettings, usersList] = await Promise.all([
                    dbService.getAll("cashBoxes"),
                    dbService.getStoreSettings(),
                    dbService.getAll("users")
                ]);
                setCashBoxes(boxes as CashBox[]);
                setSettings(allSettings);
                setUsers(usersList as AppUser[]);`;
const newInit = `                const [boxes, allSettings, usersList, customersList, suppliersList] = await Promise.all([
                    dbService.getAll("cashBoxes"),
                    dbService.getStoreSettings(),
                    dbService.getAll("users"),
                    dbService.getAll("customers"),
                    dbService.getAll("suppliers")
                ]);
                setCashBoxes(boxes as CashBox[]);
                setSettings(allSettings);
                setUsers(usersList as AppUser[]);
                setCustomers(customersList as Customer[]);
                setSuppliers(suppliersList as Supplier[]);`;
code = code.replace(initMatch, newInit);

// 4. Update the edit mode setting
const editMatch = `                        setPartnerName(toEdit.partnerName);`;
const newEditMatch = `                        setPartnerName(toEdit.partnerName);
                        setSearchPartnerTerm(toEdit.partnerName || "");
                        setSelectedPartnerId(toEdit.partnerId || "");`;
code = code.replace(editMatch, newEditMatch);

// 5. Add partner logic functions
const logicInsertion = `    const handleSave = async (printAfter: boolean = false) => {`;
const newLogic = `    const partners = partnerType === 'customer' ? customers : suppliers;
    const filteredPartners = partners.filter(p => 
        (p.name || '').toLowerCase().includes(searchPartnerTerm.toLowerCase()) ||
        (p.phone || '').toLowerCase().includes(searchPartnerTerm.toLowerCase())
    );

    const handleSearchPartnerChange = (val: string) => {
        setSearchPartnerTerm(val);
        setIsNewPartner(false);
        setSelectedPartnerId("");
        setShowPartnerSuggestions(true);
    };

    const selectPartnerSuggestion = (p: Customer | Supplier) => {
        setSelectedPartnerId(p.id || "");
        setSearchPartnerTerm(p.name);
        setPartnerPhone(p.phone || "");
        setIsNewPartner(false);
        setShowPartnerSuggestions(false);
    };

    const activateQuickNewPartner = () => {
        setIsNewPartner(true);
        setPartnerName(searchPartnerTerm);
        setShowPartnerSuggestions(false);
    };

    const handleSave = async (printAfter: boolean = false) => {`;
code = code.replace(logicInsertion, newLogic);

// 6. Fix validation and save mapping
code = code.replace(
    `if (partnerType !== 'none' && !partnerName.trim()) {`, 
    `if (partnerType !== 'none' && !searchPartnerTerm.trim() && !partnerName.trim()) {`
);

const entryMappingMatch = `                partnerId: oldEntryData?.partnerId || "",
                partnerName: partnerType === 'none' ? 'إدخال عام' : partnerName.trim(),`;
const newEntryMapping = `                partnerId: isNewPartner ? "" : (selectedPartnerId || oldEntryData?.partnerId || ""),
                partnerName: partnerType === 'none' ? 'إدخال عام' : (isNewPartner ? searchPartnerTerm.trim() : (partners.find(p => p.id === selectedPartnerId)?.name || searchPartnerTerm.trim() || partnerName.trim())),`;
code = code.replace(entryMappingMatch, newEntryMapping);

code = code.replace(
    `autoCreatePartner: partnerType !== 'none' && !oldEntryData?.partnerId,`,
    `autoCreatePartner: partnerType !== 'none' && (isNewPartner || (!selectedPartnerId && !oldEntryData?.partnerId)),`
);

fs.writeFileSync('src/components/QuickEntry.tsx', code, 'utf-8');
console.log("Replaced logic in QuickEntry");
