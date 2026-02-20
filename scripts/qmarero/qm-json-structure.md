{
  "fecha": "2026-02-20",                              // Fecha del día consultado
    "generadoEn": "2026-02-20T18:41:25.743Z",         // Timestamp de generación
      "error": null,                                  // Error si hubo alguno
        "totalTickets": 5,                            // Total de tickets PAID del día
          "tickets": [                                // Array de tickets
            {
              "id": "...",                            // ID del ticket
              "closedAt": "...",                      // Fecha/hora de cierre
              "totalAmount": 69.1,                    // Total del ticket
              "status": "PAID",                       // Estado (siempre PAID)
              "table": { ... },                       // Información de la mesa
              "products": [... ],                     // ⚠️ Solo IDs y cantidades
              "orders": [                             // ✅ AQUÍ ESTÁN LOS PLATOS
                {
                  "id": "...",
                  "items": [
                    {
                      "id": "...",
                      "product": {                    // ✅ INFORMACIÓN DEL PRODUCTO
                        "id": "...",
                        "name": "Sopa de Calabaza",   // ✅ NOMBRE DEL PLATO
                        "price": 15.9,                // ✅ PRECIO
                        "category": {
                          "id": "...",
                          "name": "Entrantes"         // ✅ CATEGORÍA
                        }
                      },
                      "quantity": 3                   // ✅ CANTIDAD VENDIDA
                    }
                  ]
                }
              ]
            }
          ]
}


Q_API_BODY='{"operationName":"GetListBills","variables":{"input":{"page":1,"pageSize":6,"fromDate":"2025-10-17T07:22:48.689Z","status":["PAID"]}},"query":"query GetListBills($input: BillPaginatedInput) {\n  bills(input: $input) {\n    page\n    pages\n    hasNext\n    hasPrev\n    totalResults\n    orderBy {\n      field\n      ordering\n      __typename\n    }\n    objects {\n      ...ListBill\n      __typename\n    }\n    totalBillAmount\n    totalAmount\n    __typename\n  }\n}\n\nfragment ListBill on BillType {\n  id\n  comment\n  created\n  closedAt\n  tipAmount\n  totalAmountWithoutDiscount\n  totalAmount\n  totalAmountPaid\n  discounts {\n    ...Discount\n    __typename\n  }\n  table {\n    id\n    code\n    place {\n      ...BasePlace\n      __typename\n    }\n    __typename\n  }\n  client {\n    ...CrmCustomer\n    __typename\n  }\n  status\n  invoices {\n    ...BaseInvoice\n    __typename\n  }\n  payments {\n    id\n    paymentMethod\n    paymentPlatform\n    status\n    amount\n    tipAmount\n    totalNotRefundedAmountWithTips\n    __typename\n  }\n  products {\n    id\n    orderItemId\n    quantity\n    discount {\n      id\n      __typename\n    }\n    __typename\n  }\n  orders {\n    id\n    items {\n      id\n      product {\n        id\n        name\n        price\n        category {\n          id\n          name\n          __typename\n        }\n        __typename\n      }\n      quantity\n      __typename\n    }\n    __typename\n  }\n  reviews {\n    ...Review\n    __typename\n  }\n  __typename\n}\n\nfragment Discount on DiscountType {\n  id\n  mode\n  amount\n  option\n  percentage\n  comment\n  concept\n  __typename\n}\n\nfragment BasePlace on PlaceType {\n  id\n  name\n  operative\n  isPrepaid\n  __typename\n}\n\nfragment CrmCustomer on CrmCustomerType {\n  ...BaseCrmCustomer\n  restaurant {\n    id\n    name\n    __typename\n  }\n  __typename\n}\n\nfragment BaseCrmCustomer on CrmCustomerType {\n  id\n  firstName\n  lastName\n  fullName\n  phone\n  phoneCountryCode\n  fullPhone\n  email\n  preferredContactMethod\n  dob\n  vatNumber\n  address\n  city\n  postalCode\n  balance\n  created\n  modified\n  lastVisitDate\n  lifetimeSpent\n  visitCount\n  isTop\n  lifetimeSpent\n  topRank\n  tags {\n    ...CrmTag\n    __typename\n  }\n  __typename\n}\n\nfragment CrmTag on CRMTagType {\n  id\n  name\n  normalizedName\n  isManual\n  created\n  __typename\n}\n\nfragment BaseInvoice on InvoiceType {\n  id\n  code\n  variant\n  status\n  date\n  customer {\n    ...InvoiceActor\n    __typename\n  }\n  __typename\n}\n\nfragment InvoiceActor on InvoiceActorType {\n  cif\n  address\n  postalCode\n  name\n  phone\n  email\n  __typename\n}\n\nfragment Review on ReviewType {\n  id\n  created\n  modified\n  restaurantId\n  billId\n  reservationId\n  overallRating\n  serviceRating\n  atmosphereRating\n  foodRating\n  notes\n  customerName\n  customerEmail\n  isPublished\n  __typename\n}"}'